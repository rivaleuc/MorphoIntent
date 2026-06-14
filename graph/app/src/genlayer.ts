import { createClient } from 'genlayer-js'
import { testnetBradbury } from 'genlayer-js/chains'
import type { Address } from 'genlayer-js/types'
export const CONTRACT = '0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09' as Address
export const client = createClient({ chain: testnetBradbury })
let walletAddress: string | null = null
export function account(): string | null { return walletAddress }
export function isWalletConnected(): boolean { return walletAddress !== null }
export async function connectWallet(): Promise<string> {
  const eth = (globalThis as any).window?.ethereum
  if (!eth) throw new Error('MetaMask not found — install it to sign transactions.')
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' })
  await client.connect(testnetBradbury)
  walletAddress = accounts[0]
  ;(client as any).account = walletAddress
  return walletAddress
}
export async function read(fn: string, args: any[] = []) {
  return client.readContract({ address: CONTRACT, functionName: fn, args })
}
export async function write(fn: string, args: any[] = []) {
  if (!walletAddress) await connectWallet()
  const txHash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value: 0n })
  await client.waitForTransactionReceipt({ hash: txHash, status: 'FINALIZED', retries: 60, interval: 5000 })
  return txHash
}
