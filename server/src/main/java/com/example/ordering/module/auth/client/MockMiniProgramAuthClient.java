package com.example.ordering.module.auth.client;

import com.example.ordering.common.Platform;

/**
 * 开发环境模拟登录（app.auth.mock-enabled=true）。
 * <ul>
 *   <li>code 以 "mock:" 开头：冒号后的内容作为 openId，便于模拟多个顾客</li>
 *   <li>其他 code（例如开发者工具里真实的 Taro.login code）：固定映射为该平台的开发顾客</li>
 * </ul>
 */
public class MockMiniProgramAuthClient implements MiniProgramAuthClient {

    private final Platform platform;

    public MockMiniProgramAuthClient(Platform platform) {
        this.platform = platform;
    }

    @Override
    public Platform platform() {
        return platform;
    }

    @Override
    public MiniProgramIdentity exchange(String code) {
        String suffix = code.startsWith("mock:") && code.length() > 5 ? code.substring(5) : "dev";
        return new MiniProgramIdentity("mock_" + platform.name().toLowerCase() + "_" + suffix, null);
    }
}
