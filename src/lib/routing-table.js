'use strict'

const { LiquidityCurve } = require('ilp-routing')

class RoutingTable {
  constructor ({ initialTable }) {
    this.initialTable = (initialTable || []).map(entry => Object.assign(entry, {
      curveLocal: new LiquidityCurve(entry.curveLocal)
    }))
  }

  getNextHop (account) {
    for (let entry of this.initialTable) {
      if (account.startsWith(entry.prefix)) {
        return entry
      }
    }
  }
}

module.exports = RoutingTable
