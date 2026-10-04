package com.example.ordering.module.pay.channel;

/**
 * 退款执行 / 查询结果。
 * <ul>
 *   <li>UNKNOWN：结果不明确（执行或查询出错）——保持处理中，绝不能当作失败，否则可能重复退款</li>
 *   <li>NOT_FOUND：查无此退款——可用同一退款单号安全地重新提交（余额返还按单号幂等）</li>
 * </ul>
 */
public record RefundResult(State state, String channelRefundNo, String failReason) {

    public enum State { SUCCESS, FAILED, UNKNOWN, NOT_FOUND }

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
