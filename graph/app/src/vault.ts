// Minimal EVM bridge to the IntentBond vault (graph/IntentBond.sol).
// The MorphoIntent intelligent contract produces the verdict; this module
// maps that verdict into the matching settlement call on the EVM vault.
// All calls route through window.ethereum (same wallet/chain as genlayer.ts).

export const VAULT = '0x6d314Ca81BadB98be04c482b939e691534834aE5'

const SEL = {
  createBond: '0x1cb6eae8', // createBond(address,uint256)
  returnBond: '0x8b260104', // returnBond(uint256)
  claimBond: '0x1c08c08e', // claimBond(uint256)
  splitBond: '0x071d764d', // splitBond(uint256,uint256)
  bondCount: '0x8edd4d24', // bondCount()
  bonds: '0x5f1c17c0', // bonds(uint256)
}

function eth() {
  const e = (globalThis as any).window?.ethereum
  if (!e) throw new Error('MetaMask not found — install it to sign transactions.')
  return e
}

const pad = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')
const u256 = (n: bigint | number) => pad(BigInt(n).toString(16))
const addr = (a: string) => pad(a.toLowerCase())

async function send(data: string, valueWei: bigint = 0n): Promise<string> {
  const e = eth()
  const [from] = await e.request({ method: 'eth_requestAccounts' })
  return e.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: VAULT, data, value: '0x' + valueWei.toString(16) }],
  })
}

async function call(data: string): Promise<string> {
  return eth().request({ method: 'eth_call', params: [{ to: VAULT, data }, 'latest'] })
}

export async function createBond(beneficiary: string, intentKey: number, valueWei: bigint): Promise<string> {
  return send(SEL.createBond + addr(beneficiary) + u256(intentKey), valueWei)
}

export type SettleAction = 'returnBond' | 'claimBond' | 'splitBond'

export async function settle(action: SettleAction, bondId: number, depositorBps = 0): Promise<string> {
  if (action === 'splitBond') return send(SEL.splitBond + u256(bondId) + u256(depositorBps))
  return send(SEL[action] + u256(bondId))
}

export async function bondCount(): Promise<number> {
  const r = await call(SEL.bondCount)
  return Number(BigInt(r || '0x0'))
}

export type Bond = {
  depositor: string
  beneficiary: string
  amount: bigint
  intentKey: number
  settled: boolean
}

export async function readBond(id: number): Promise<Bond> {
  const r = (await call(SEL.bonds + u256(id))).replace(/^0x/, '')
  const word = (i: number) => r.slice(i * 64, i * 64 + 64)
  return {
    depositor: '0x' + word(0).slice(24),
    beneficiary: '0x' + word(1).slice(24),
    amount: BigInt('0x' + (word(2) || '0')),
    intentKey: Number(BigInt('0x' + (word(3) || '0'))),
    settled: BigInt('0x' + (word(4) || '0')) === 1n,
  }
}
