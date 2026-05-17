const { Router } = require('express')
const { getGroupedProducts } = require('../config/products')

const router = Router()

router.get('/', (req, res) => {
  const grouped = getGroupedProducts()
  res.render('index', { grouped })
})

module.exports = router
