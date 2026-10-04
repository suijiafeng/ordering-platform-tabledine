package com.example.ordering.module.pay.channel;

import com.example.ordering.common.Platform;
import com.example.ordering.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 按平台选择支付渠道；{@code app.pay.mock-enabled=true} 时全部走 Mock（生产 profile 下拒绝启动）。
 */
@Slf4j
@Component
public class PayChannelRegistry {

    private final Map<Platform, PayChannel> channels = new EnumMap<>(Platform.class);
    private final boolean mock;

    public PayChannelRegistry(List<PayChannel> realChannels, AppProperties appProperties,
                              org.springframework.core.env.Environment env) {
        this.mock = appProperties.getPay().isMockEnabled();
        if (mock) {
            // 白名单而不是黑名单：只有显式 dev / test 才允许模拟渠道（profile 名叫 production / prd 也拒绝）
            if (!com.example.ordering.config.StartupSafetyCheck.isDevOrTest(env)) {
                throw new IllegalStateException("仅 dev / test 环境允许开启支付 Mock（app.pay.mock-enabled）");
            }
            log.warn("支付渠道处于 MOCK 模式，不会发生真实资金往来，仅限开发 / 测试环境");
            for (Platform p : Platform.values()) {
                channels.put(p, new MockPayChannel(p));
            }
        } else {
            realChannels.forEach(c -> channels.put(c.platform(), c));
        }
    }

    public boolean isMock() {
        return mock;
    }

    public PayChannel get(Platform platform) {
        PayChannel channel = channels.get(platform);
        if (channel == null) {
            throw new IllegalStateException("未找到支付渠道实现: " + platform);
        }
        return channel;
    }

    /** 仅 Mock 模式可用 */
    public MockPayChannel mock(Platform platform) {
        PayChannel c = get(platform);
        if (c instanceof MockPayChannel m) {
            return m;
        }
        throw new IllegalStateException("当前不是 Mock 渠道");
    }
}
