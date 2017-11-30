'use strict'

const { LiquidityCurve } = require('ilp-routing')

class RoutingTable {
  constructor ({ initialTable }) {
    this.setRoutes(initialTable || [])
  }

  getNextHop (account) {
    for (let entry of this.routes) {
      if (account.startsWith(entry.prefix)) {
        return entry
      }
    }
  }

  setRoutes (routes) {
    this.routes = routes.map(entry => Object.assign(entry, {
      curveLocal: new LiquidityCurve(entry.curveLocal),
      curveRemote: new LiquidityCurve(entry.curveRemote)
    }))
  }
}

module.exports = RoutingTable
