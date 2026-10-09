import { Button, Card, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useIsKitchen } from '../../utils/auth'

/**
 * 无权访问：明确告知原因，而不是悄悄跳走。
 * need=OWNER：店主专属页面；need=FRONT：前厅 / 店主的页面（后厨账号只处理前厅确认后的订单）。
 */
export default function ForbiddenPage({ need = 'OWNER' }: { need?: 'OWNER' | 'FRONT' }) {
  const navigate = useNavigate()
  const isKitchen = useIsKitchen()
  const home = isKitchen ? '/kitchen' : '/'
  return (
    <Card>
      <Result
        status="403"
        title={need === 'OWNER' ? '需要店主权限' : '后厨账号无法查看此页面'}
        subTitle={need === 'OWNER'
          ? '当前账号无法查看此页面。如需使用，请联系店主开通。'
          : '接单、拒单、送达由前厅负责；后厨请在「后厨队列」处理前厅已确认的订单。'}
        extra={<Button type="primary" onClick={() => navigate(home)}>{isKitchen ? '返回后厨队列' : '返回工作台'}</Button>}
      />
    </Card>
  )
}
