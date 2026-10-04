import { useState } from 'react'
import { Button, Image, Space, Upload } from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { uploadImage } from '../api/store'

interface Props {
  value?: string | null
  onChange?: (url: string | null) => void
}

/** 图片上传（受控组件，配合 Form.Item 使用）：上传后保存后端返回的相对路径 */
export default function ImageUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)

  return (
    <Space align="start">
      {value && <Image src={value} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} />}
      <Space direction="vertical">
        <Upload
          accept="image/jpeg,image/png"
          showUploadList={false}
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
