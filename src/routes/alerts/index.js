const express = require("express");
const auth = require("../../middlewares/auth");

const createController = require("../../controllers/alerts/create.controller");
const listController = require("../../controllers/alerts/list.controller");
const deleteController = require("../../controllers/alerts/delete.controller");

const router = express.Router();

router.post("/", auth, createController);
router.get("/", auth, listController);
router.delete("/:id", auth, deleteController);

module.exports = router;
