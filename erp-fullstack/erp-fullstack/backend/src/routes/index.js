import { Router } from "express";
import { verifyToken, requirePerm } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";
import * as product from "../controllers/product.controller.js";
import * as order from "../controllers/order.controller.js";
import { makeCrud } from "../controllers/crud.factory.js";
import * as reportService from "../services/report.service.js";
import { asyncHandler } from "../utils/http.js";

const r = Router();

// -------- Auth (public login, còn lại cần token) --------
r.post("/auth/login", auth.login);
r.get("/auth/me", verifyToken, auth.me);

// -------- Products + Variants (#15) --------
r.get("/products", verifyToken, requirePerm("products"), product.list);
r.get("/products/:id", verifyToken, requirePerm("products"), product.getOne);
r.post("/products", verifyToken, requirePerm("products"), product.create);
r.put("/products/:id", verifyToken, requirePerm("products"), product.update);
r.delete("/products/:id", verifyToken, requirePerm("products"), product.remove);
r.get("/products/:id/variants", verifyToken, requirePerm("products"), product.listVariants);
r.post("/products/:id/variants", verifyToken, requirePerm("products"), product.createVariant);
r.put("/products/:id/variants/:variantId", verifyToken, requirePerm("products"), product.updateVariant);
r.delete("/products/:id/variants/:variantId", verifyToken, requirePerm("products"), product.removeVariant);

// -------- Warehouses (#15) --------
const warehouses = makeCrud("warehouses", ["code", "name", "address"]);
r.get("/warehouses", verifyToken, requirePerm("warehouse"), warehouses.list);
r.get("/warehouses/:id", verifyToken, requirePerm("warehouse"), warehouses.getOne);
r.post("/warehouses", verifyToken, requirePerm("warehouse"), warehouses.create);
r.put("/warehouses/:id", verifyToken, requirePerm("warehouse"), warehouses.update);
r.delete("/warehouses/:id", verifyToken, requirePerm("warehouse"), warehouses.remove);

// -------- Customers (#15) --------
const customers = makeCrud("customers", ["name", "phone", "email", "address", "group_name"]);
r.get("/customers", verifyToken, requirePerm("crm"), customers.list);
r.get("/customers/:id", verifyToken, requirePerm("crm"), customers.getOne);
r.post("/customers", verifyToken, requirePerm("crm"), customers.create);
r.put("/customers/:id", verifyToken, requirePerm("crm"), customers.update);
r.delete("/customers/:id", verifyToken, requirePerm("crm"), customers.remove);

// -------- Suppliers (#15) --------
const suppliers = makeCrud("suppliers", ["name", "contact", "phone", "email", "debt"]);
r.get("/suppliers", verifyToken, requirePerm("suppliers"), suppliers.list);
r.get("/suppliers/:id", verifyToken, requirePerm("suppliers"), suppliers.getOne);
r.post("/suppliers", verifyToken, requirePerm("suppliers"), suppliers.create);
r.put("/suppliers/:id", verifyToken, requirePerm("suppliers"), suppliers.update);
r.delete("/suppliers/:id", verifyToken, requirePerm("suppliers"), suppliers.remove);

// -------- Transactions (#15) --------
const transactions = makeCrud("transactions", [
  "code", "type", "category", "amount", "date", "method",
  "party_type", "party_id", "party_name", "ref_type", "ref_id", "note", "created_by",
]);
r.get("/transactions", verifyToken, requirePerm("finance"), transactions.list);
r.get("/transactions/:id", verifyToken, requirePerm("finance"), transactions.getOne);
r.post("/transactions", verifyToken, requirePerm("finance"), transactions.create);
r.put("/transactions/:id", verifyToken, requirePerm("finance"), transactions.update);
r.delete("/transactions/:id", verifyToken, requirePerm("finance"), transactions.remove);

// -------- Orders (#15 + #7/#8/#9/#12) --------
r.get("/orders", verifyToken, requirePerm("orders"), order.list);
r.get("/orders/:id", verifyToken, requirePerm("orders"), order.getOne);
r.post("/orders", verifyToken, requirePerm("orders"), order.create);
r.patch("/orders/:id/status", verifyToken, requirePerm("orders_edit"), order.changeStatus);
r.get("/orders/:id/invoice", verifyToken, requirePerm("orders"), order.invoice);

// -------- Reports (#11) --------
r.get("/reports/profit", verifyToken, requirePerm("view_revenue"),
  asyncHandler(async (req, res) => res.json(await reportService.profitReport(req.query))));
r.get("/reports/inventory", verifyToken, requirePerm("reports"),
  asyncHandler(async (req, res) => res.json(await reportService.inventoryValue())));

export default r;
