package com.example.ordering.config;

import com.example.ordering.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 生产部署：nginx 以 https 对外，再用 http 反代到后端。浏览器的同源请求带 Origin: https://域名，
 * 后端必须按 X-Forwarded-Proto 还原协议，才能认出是同源；跨域来源仍然拒绝。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ForwardedHeadersIntegrationTest extends AbstractIntegrationTest {

    @LocalServerPort
    int port;

    private int login(String origin) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/m/auth/login"))
                .header("Content-Type", "application/json")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-For", "203.0.113.7")
                .header("Origin", origin)
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .build();
        return HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).statusCode();
    }

    @Test
    void sameOriginBehindHttpsProxyIsAccepted() throws Exception {
        assertThat(login("https://localhost")).isEqualTo(200);
    }

    @Test
    void crossOriginIsStillRejected() throws Exception {
        assertThat(login("https://evil.example")).isEqualTo(403);
    }
}
