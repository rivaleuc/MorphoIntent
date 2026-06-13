import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury } from 'genlayer-js/chains'
import type { Address } from 'genlayer-js/types'
export const CONTRACT = '0x853Df1088469bFf13e4dFbdb3637Ef40Dfd6DC09' as Address
const PK = (import.meta.env.VITE_BURNER_PK ?? '') as `0x${string}`
const account = PK ? createAccount(PK) : undefined
export const client = createClient({ chain: testnetBradbury, account })
export async function read(fn: string, args: any[] = []) { return client.readContract({ address: CONTRACT, functionName: fn, args }) }
export async function write(fn: string, args: any[] = []) {
  const txHash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value: 0n })
  await client.waitForTransactionReceipt({ hash: txHash, status: 'FINALIZED', retries: 60, interval: 5000 })
  return txHash
}
