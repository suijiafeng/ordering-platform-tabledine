package com.example.ordering.module.pay.channel;

/**
 * 渠道退款结果。
 * <ul>
 *   <li>UNKNOWN：结果不明确（超时、渠道繁忙、查询出错）——保持处理中，绝不能当作失败，否则可能重复退款</li>
 *   <li>NOT_FOUND：渠道明确查无此退款单——可用同一退款单号安全地重新提交（渠道按单号幂等）</li>
 * </ul>
 */
public record RefundResult(State state, String channelRefundNo, String failReason) {

    public enum State { PROCESSING, SUCCESS, FAILED, UNKNOWN, NOT_FOUND }

    public static RefundResult processing(String channelRefundNo) {
        return new RefundResult(State.PROCESSING, channelRefundNo, null);
    }

    public static RefundResult success(String channelRefundNo) {
        return new RefundResult(State.SUCCESS, channelRefundNo, null);
    }

    public static RefundResult failed(String reason) {
        return new RefundResult(State.FAILED, null, reason);
    }

    public static RefundResult unknown() {
        return new RefundResult(State.UNKNOWN, null, null);
    }

    public static RefundResult notFound() {
        return new RefundResult(State.NOT_FOUND, null, null);
    }
}
