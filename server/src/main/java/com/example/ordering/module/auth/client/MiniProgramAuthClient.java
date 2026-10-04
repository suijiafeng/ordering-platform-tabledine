package com.example.ordering.module.auth.client;

import com.example.ordering.common.Platform;

/**
 * 小程序登录凭证换取用户身份。
 */
public interface MiniProgramAuthClient {

    Platform platform();

    /**
     * @param code 微信 Taro.login() 的 code / 支付宝 my.getAuthCode() 的 authCode
     * @throws com.example.ordering.common.BusinessException 换取失败（40104）
     */
    MiniProgramIdentity exchange(String code);
}
