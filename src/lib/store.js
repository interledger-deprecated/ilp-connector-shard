'use strict'

class Store {
  constructor () {
    this.data = new Map()
  }

  get (key) {
    return this.data.get(key)
  }

  put (key, value) {
    return this.data.set(key, value)
  }
}

module.exports = Store
