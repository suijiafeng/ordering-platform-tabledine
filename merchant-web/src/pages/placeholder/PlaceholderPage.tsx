import { Result } from 'antd'

export default function PlaceholderPage({ title, week }: { title: string; week: string }) {
  return <Result status="info" title={title} subTitle={`计划在${week}实现`} />
}
