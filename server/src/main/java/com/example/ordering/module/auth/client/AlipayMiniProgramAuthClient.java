package com.example.ordering.module.auth.client;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * 支付宝小程序 alipay.system.oauth.token（grant_type=authorization_code）。
 * <p>
 * 新创建的支付宝应用默认返回 open_id；老应用返回 user_id，这里优先取 open_id。
 * <p>
 * TODO（第 3 周支付模块）：引入支付宝官方 SDK 后统一替换，并对响应做验签。
 * 当前登录场景仅取用户标识，经 HTTPS 访问支付宝网关，风险可控。
 */
@Slf4j
@Component
public class AlipayMiniProgramAuthClient implements MiniProgramAuthClient {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AppProperties.Alipay props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public AlipayMiniProgramAuthClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this.props = appProperties.getAlipay();
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public Platform platform() {
        return Platform.ALIPAY;
    }

    @Override
    public MiniProgramIdentity exchange(String code) {
        if (!StringUtils.hasText(props.getAppId()) || !StringUtils.hasText(props.getPrivateKey())) {
            throw new IllegalStateException("未配置支付宝小程序 appId / privateKey");
        }
        Map<String, String> params = new HashMap<>();
        params.put("app_id", props.getAppId());
        params.put("method", "alipay.system.oauth.token");
        params.put("format", "JSON");
        params.put("charset", "utf-8");
        params.put("sign_type", "RSA2");
        params.put("timestamp", ZonedDateTime.now(ZoneId.of("Asia/Shanghai")).format(TS));
        params.put("version", "1.0");
        params.put("grant_type", "authorization_code");
        params.put("code", code);
        params.put("sign", AlipaySigner.sign(params, props.getPrivateKey()));

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach(form::add);
        try {
            String body = restClient.post()
                    .uri(props.getGateway())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(body);
            JsonNode resp = root.path("alipay_system_oauth_token_response");
            String openId = resp.path("open_id").asText(null);
            if (!StringUtils.hasText(openId)) {
                openId = resp.path("user_id").asText(null);
            }
            if (!StringUtils.hasText(openId)) {
                JsonNode err = root.path("error_response");
                log.warn("支付宝 oauth.token 失败 code={} subCode={} msg={}",
                        err.path("code").asText(), err.path("sub_code").asText(), err.path("sub_msg").asText());
                throw new BusinessException(ErrorCode.MINIAPP_LOGIN_FAILED);
            }
            return new MiniProgramIdentity(openId, null);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用支付宝 oauth.token 异常", e);
            throw new BusinessException(ErrorCode.MINIAPP_LOGIN_FAILED);
        }
    }
}
