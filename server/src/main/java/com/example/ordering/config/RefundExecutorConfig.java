package com.example.ordering.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 退款返还余额的执行线程。
 * <p>
 * 退款单事务提交后才返还余额（见 RefundService），返还本身又要开自己的事务。若在请求线程里执行，
 * 请求线程还握着已提交事务的连接，返还再占一个：几十笔退款同时发生时连接池会被占满。
 * 所以提交后把返还交给这个独立的小线程池，请求线程立即归还连接并返回「处理中」。
 * <p>
 * 队列满（极端情况）时拒绝提交：退款单仍是「处理中」，由补偿任务按钱包流水重试，不会丢。
 * {@code app.refund.async=false} 时改为同步执行（测试用，也可用于排查问题）。
 */
@Configuration
public class RefundExecutorConfig {

    public static final String BEAN_NAME = "refundExecutor";

    @Bean(BEAN_NAME)
    @ConditionalOnProperty(name = "app.refund.async", havingValue = "true", matchIfMissing = true)
    public Executor asyncRefundExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("refund-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(500);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        // 停机时等正在返还的几笔做完（最多 30 秒），避免半途而废留给补偿任务
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        return executor;
    }

    @Bean(BEAN_NAME)
    @ConditionalOnProperty(name = "app.refund.async", havingValue = "false")
    public Executor syncRefundExecutor() {
        return new SyncTaskExecutor();
    }
}
