import { promises as fs } from 'node:fs'

/** 为可撤销删除创建快照；Windows 上物化目录链接，避免创建符号链接所需的权限。 */
export async function copyUndoSnapshot(sourcePath: string, destinationPath: string): Promise<void> {
  await fs.cp(sourcePath, destinationPath, {
    recursive: true,
    dereference: process.platform === 'win32',
  })
}
