class InterledgerError extends Error {
  constructor (reason) {
    super(JSON.stringify(reason))
    this.reason = reason
    this.name = 'InterledgerError'
  }
}

module.exports = {
  InterledgerError
}
