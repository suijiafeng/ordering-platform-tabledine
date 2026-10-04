package com.example.ordering.module.auth.client;

import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 按平台选择登录客户端；开启 mock 时全部走模拟实现。
 */
@Slf4j
@Component
public class MiniProgramAuthClientRegistry {

    private final Map<Platform, MiniProgramAuthClient> clients = new EnumMap<>(Platform.class);

    public MiniProgramAuthClientRegistry(List<MiniProgramAuthClient> realClients, AppProperties appProperties) {
        if (appProperties.getAuth().isMockEnabled()) {
            log.warn("小程序登录处于 MOCK 模式，仅限开发环境使用");
            for (Platform p : Platform.values()) {
                clients.put(p, new MockMiniProgramAuthClient(p));
            }
        } else {
            realClients.forEach(c -> clients.put(c.platform(), c));
        }
    }

    public MiniProgramAuthClient get(Platform platform) {
        MiniProgramAuthClient client = clients.get(platform);
        if (client == null) {
            throw new IllegalStateException("未找到平台登录实现: " + platform);
        }
        return client;
    }
}
