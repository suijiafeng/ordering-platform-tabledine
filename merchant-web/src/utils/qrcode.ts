import QRCode from 'qrcode'

/** 生成桌码二维码图片（data URL） */
export function qrDataUrl(text: string, size = 240): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' })
}

/**
 * 生成可打印的桌码卡片 PNG：店名 + 二维码 + 桌号 + 提示语，并触发下载。
 */
export async function downloadTableCard(storeName: string, code: string, url: string) {
  const width = 600
  const height = 820
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#222'
  ctx.textAlign = 'center'
  ctx.font = 'bold 36px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(storeName, width / 2, 70)

  const img = new Image()
  img.src = await qrDataUrl(url, 460)
  await img.decode()
  ctx.drawImage(img, (width - 460) / 2, 110, 460, 460)

  ctx.font = 'bold 64px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(`桌号 ${code}`, width / 2, 660)
  ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#666'
  ctx.fillText('手机扫码点餐', width / 2, 730)

  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `桌码-${code}.png`
  a.click()
}
