import { useEffect, useState } from 'react'
import { Card, Col, Descriptions, Row, Skeleton, Statistic, Tag } from 'antd'
import { fetchStore } from '../../api/auth'
import type { StoreDetail } from '../../api/types'

/** 工作台（第 1 周：展示门店信息，验证鉴权闭环；今日概览与新订单提醒在第 3~4 周接入） */
export default function DashboardPage() {
  const [store, setStore] = useState<StoreDetail | null>(null)

  useEffect(() => {
    fetchStore().then(setStore).catch(() => setStore(null))
  }, [])

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="门店信息">
          {store ? (
            <Descriptions column={{ xs: 1, md: 2, xl: 3 }}>
              <Descriptions.Item label="门店">{store.name}</Descriptions.Item>
              <Descriptions.Item label="营业状态">
                {store.businessStatus === 1 ? <Tag color="green">营业中</Tag> : <Tag>已打烊</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="营业时间">{store.businessHours ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="接单模式">{store.autoAccept ? '自动接单' : '手动接单'}</Descriptions.Item>
              <Descriptions.Item label="未支付关单">{store.payTimeoutMin} 分钟</Descriptions.Item>
              <Descriptions.Item label="未接单自动退款">{store.acceptTimeoutMin} 分钟</Descriptions.Item>
            </Descriptions>
          ) : (
            <Skeleton active paragraph={{ rows: 2 }} />
          )}
        </Card>
      </Col>
      {['今日实收', '今日订单', '待接单', '待处理退款'].map((title) => (
        <Col key={title} xs={12} lg={6}>
          <Card>
            <Statistic title={title} value="-" />
          </Card>
        </Col>
      ))}
    </Row>
  )
}
