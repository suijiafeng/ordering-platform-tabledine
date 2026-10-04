import { Text, View } from '@tarojs/components'
import './Stepper.css'

interface Props {
  value: number
  onMinus: () => void
  onPlus: () => void
  /** 数量为 0 时只显示加号 */
  compact?: boolean
}

export default function Stepper({ value, onMinus, onPlus, compact = true }: Props) {
  return (
    <View className='stepper'>
      {(!compact || value > 0) && (
        <>
          <View className='stepper-btn minus' onClick={(e) => { e.stopPropagation(); onMinus() }}>
            <Text>－</Text>
          </View>
          <Text className='stepper-value'>{value}</Text>
        </>
      )}
      <View className='stepper-btn plus' onClick={(e) => { e.stopPropagation(); onPlus() }}>
        <Text>＋</Text>
      </View>
    </View>
  )
}
