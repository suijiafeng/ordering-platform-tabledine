package com.example.ordering.module.auth.client;

import com.example.ordering.common.BusinessException;
import com.example.ordering.common.ErrorCode;
import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

/**
 * 微信小程序 code2Session。
 * 文档：GET /sns/jscode2session?appid=&secret=&js_code=&grant_type=authorization_code
 * 注意：微信返回的 Content-Type 可能是 text/plain，这里按字符串读取后再解析 JSON。
 */
@Slf4j
@Component
public class WechatMiniProgramAuthClient implements MiniProgramAuthClient {

    private final AppProperties.Wechat props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public WechatMiniProgramAuthClient(AppProperties appProperties, ObjectMapper objectMapper) {
        this.props = appProperties.getWechat();
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.restClient = RestClient.builder().baseUrl(props.getApiBase()).requestFactory(factory).build();
    }

    @Override
    public Platform platform() {
        return Platform.WECHAT;
    }

    @Override
    public MiniProgramIdentity exchange(String code) {
        if (!StringUtils.hasText(props.getAppId()) || !StringUtils.hasText(props.getAppSecret())) {
            throw new IllegalStateException("未配置微信小程序 appId / appSecret");
        }
        try {
            String body = restClient.get()
                    .uri(uri -> uri.path("/sns/jscode2session")
                            .queryParam("appid", props.getAppId())
                            .queryParam("secret", props.getAppSecret())
                            .queryParam("js_code", code)
                            .queryParam("grant_type", "authorization_code")
                            .build())
                    .retrieve()
                    .body(String.class);
            JsonNode json = objectMapper.readTree(body);
            int errcode = json.path("errcode").asInt(0);
            String openId = json.path("openid").asText(null);
            if (errcode != 0 || !StringUtils.hasText(openId)) {
                log.warn("微信 code2Session 失败 errcode={} errmsg={}", errcode, json.path("errmsg").asText());
                throw new BusinessException(ErrorCode.MINIAPP_LOGIN_FAILED);
            }
            // session_key 本期不使用（不解密手机号等敏感数据），不落库
            return new MiniProgramIdentity(openId, json.path("unionid").asText(null));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("调用微信 code2Session 异常", e);
            throw new BusinessException(ErrorCode.MINIAPP_LOGIN_FAILED);
        }
    }
}
