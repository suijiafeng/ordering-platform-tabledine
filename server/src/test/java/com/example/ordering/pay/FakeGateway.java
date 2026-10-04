package com.example.ordering.pay;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

/** 本地假网关：记录收到的请求，按测试给定的函数返回应答 */
final class FakeGateway implements AutoCloseable {

    record Req(String method, String path, String query, String body) {
    }

    record Resp(int status, String body, Map<String, String> headers) {
    }

    final AtomicReference<Req> last = new AtomicReference<>();
    private final HttpServer server;

    FakeGateway(Function<Req, Resp> handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Req req = new Req(ex.getRequestMethod(), ex.getRequestURI().getPath(), ex.getRequestURI().getRawQuery(), body);
            last.set(req);
            Resp resp = handler.apply(req);
            resp.headers().forEach((k, v) -> ex.getResponseHeaders().add(k, v));
            byte[] out = resp.body().getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(resp.status(), out.length == 0 ? -1 : out.length);
            if (out.length > 0) {
                ex.getResponseBody().write(out);
            }
            ex.close();
        });
        server.start();
    }

    String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Override
    public void close() {
        server.stop(0);
    }

    static KeyPair rsa() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            return g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    static String sign(PrivateKey key, String content) {
        try {
            Signature s = Signature.getInstance("SHA256withRSA");
            s.initSign(key);
            s.update(content.getBytes(StandardCharsets.UTF_8));
            return b64(s.sign());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
