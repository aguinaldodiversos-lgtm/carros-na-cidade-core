// subscribers.controller.js
async function subscribe(req, res) {
  const { name, phone, vehicle, city } = req.body

  const subscriber = await subscribersService.create({
    name,
    phone,
    vehicle_interest: vehicle,
    city_slug: city,
    consent_ip: req.ip,
    consent_user_agent: req.headers["user-agent"]
  })

  res.status(201).json(subscriber)
}