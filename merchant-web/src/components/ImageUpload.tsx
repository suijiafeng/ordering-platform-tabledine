import { useState } from 'react'
<<<<<<< HEAD
<<<<<<< HEAD
import { App, Button, Image, Space, Upload } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage } from '../api/store'

const MAX_SIZE = 5 * 1024 * 1024

=======
import { Button, Image, Space, Upload } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage } from '../api/store'

>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
import { App, Button, Image, Space, Upload } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage } from '../api/store'

const MAX_SIZE = 5 * 1024 * 1024

>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
interface Props {
  value?: string | null
  onChange?: (url: string | null) => void
}

/** 图片上传（受控组件，配合 Form.Item 使用）：上传后保存后端返回的相对路径 */
export default function ImageUpload({ value, onChange }: Props) {
<<<<<<< HEAD
<<<<<<< HEAD
  const { message } = App.useApp()
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
  const { message } = App.useApp()
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
  const [uploading, setUploading] = useState(false)

  return (
    <Space align="start">
      {value && <Image src={value} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} />}
      <Space direction="vertical">
        <Upload
          accept="image/jpeg,image/png"
          showUploadList={false}
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
          beforeUpload={(file) => {
            // 与后端 max-file-size: 5MB 保持一致，超限直接在前端拦截，不浪费一次上传
            if (file.size > MAX_SIZE) {
              message.error('图片不能超过 5MB')
              return Upload.LIST_IGNORE
            }
            return true
          }}
<<<<<<< HEAD
=======
>>>>>>> 4ff5965 (feat: 第 2 周菜单、桌台、店铺设置与小程序点餐页)
=======
>>>>>>> 2b17451 (feat: 添加订单管理与后厨队列功能)
          customRequest={async ({ file, onSuccess, onError }) => {
            setUploading(true)
            try {
              const res = await uploadImage(file as File)
              onChange?.(res.url)
              onSuccess?.(res)
            } catch (e) {
              onError?.(e as Error)
            } finally {
              setUploading(false)
            }
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>{value ? '更换图片' : '上传图片'}</Button>
        </Upload>
        {value && (
          <Button icon={<DeleteOutlined />} type="text" danger onClick={() => onChange?.(null)}>移除</Button>
        )}
        <span style={{ color: '#999', fontSize: 12 }}>JPG / PNG，不超过 5MB，自动压缩</span>
      </Space>
    </Space>
  )
}
