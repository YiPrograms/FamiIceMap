import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMetadata,
  classifyStore,
  normalizeStore,
  parseJsonp
} from "../scripts/lib/store-data.mjs";

test("parseJsonp parses the official callback format", () => {
  assert.deepEqual(parseJsonp('callback([{ "city": "台北市" }])'), [{ city: "台北市" }]);
});

test("classifyStore detects machine and special shape independently", () => {
  assert.deepEqual(classifyStore("ice,TwoIce,Famiice"), {
    machine: "double",
    specialShape: true
  });
  assert.deepEqual(classifyStore("ice,icecream"), {
    machine: "single",
    specialShape: false
  });
});

test("normalizeStore keeps stable, frontend-friendly fields", () => {
  const store = normalizeStore({
    pkey: "123",
    SERID: 456,
    NAME: "全家測試店",
    addr: "台北市中正區測試路１號",
    post: "100",
    TEL: "02-12345678",
    px: 121.5,
    py: 25.04,
    all: "ice,icecream"
  });

  assert.equal(store.id, "000123");
  assert.equal(store.serviceId, "00456");
  assert.equal(store.city, "台北市");
  assert.equal(store.machine, "single");
  assert.deepEqual(store.services, ["ice", "icecream"]);
});

test("buildMetadata reports overlapping special-shape stores", () => {
  const stores = [
    { machine: "single", specialShape: true },
    { machine: "double", specialShape: false },
    { machine: "unknown", specialShape: false }
  ];
  const metadata = buildMetadata(stores, "2026-07-15T00:00:00.000Z");

  assert.deepEqual(metadata.counts, {
    single: 1,
    double: 1,
    specialShape: 1,
    unclassified: 1
  });
});
