'use strict'

const base64url = require('base64url')
const request = require('superagent')
const IlpPacket = require('ilp-packet')
const { LiquidityCurve } = require('ilp-routing')

class CurveCache {
  constructor () {
    this.curves = {} // { appliesToPrefix ⇒ liquidityResponse }
  }

  async get (nextShard, destinationAccount) {
    const cachedRes = this.find(destinationAccount)
    if (cachedRes) return cachedRes.curve

    const httpRes = await request.post(nextShard + '/internal/request')
      .send({
        ilp: base64url(IlpPacket.serializeIlqpLiquidityRequest({
          destinationAccount,
          destinationHoldDuration: 10000
        }))
      })
    const res = IlpPacket.deserializeIlqpLiquidityResponse(Buffer.from(httpRes.body.ilp, 'base64'))
    res.curve = new LiquidityCurve(res.liquidityCurve)
    this.curves[res.appliesToPrefix] = res
    return res.curve
  }

  find (account) {
    let bestRes, bestLen
    for (const prefix in this.curves) {
      const res = this.curves[prefix]
      const curvePrefix = res.appliesToPrefix
      if (account.startsWith(curvePrefix)) {
        if (bestRes && bestLen < curvePrefix.length) continue
        if (new Date() < res.expiresAt) continue
        bestRes = res
        bestLen = curvePrefix.length
      }
    }
    return bestRes
  }
}

module.exports = CurveCache
