import assert from "node:assert/strict";
import test from "node:test";

import { createGiftishowClient, GiftishowError } from "./giftishow.js";

const config = { authCode: "auth", authToken: "token", userId: "user", callbackNo: "0212345678", bannerId: "banner", templateId: "card" };

test("상품 상세가 승인 snapshot과 일치할 때만 반환한다", async () => {
  const client = createGiftishowClient(config, async () => new Response(JSON.stringify({ code: "0000", result: { goodsDetail: { goodsCode: "G00005791119", brandName: "메가MGC커피", goodsName: "더블 아아 세트", salePrice: 4000, goodsStateCd: "SALE", limitDay: 30 } } }), { status: 200 }));
  assert.equal((await client.product("mega_double_americano")).salePrice, 4000);
});

test("상품명이나 판매상태가 바뀌면 발송 전 검증을 거부한다", async () => {
  const client = createGiftishowClient(config, async () => new Response(JSON.stringify({ code: "0000", result: { goodsDetail: { goodsCode: "G00005791119", brandName: "메가MGC커피", goodsName: "다른 상품", salePrice: 4000, goodsStateCd: "SALE" } } }), { status: 200 }));
  await assert.rejects(() => client.product("mega_double_americano"), (error: unknown) => error instanceof GiftishowError && error.code === "product_contract_changed");
});

test("발송 응답 timeout은 결과 불명으로 분류한다", async () => {
  const client = createGiftishowClient(config, async () => { throw new Error("timeout"); });
  await assert.rejects(() => client.send({ product: { key: "mega_double_americano", goodsCode: "G00005791119", brandName: "메가MGC커피", goodsName: "더블 아아 세트", salePrice: 4000 }, phoneNo: "01012345678", trId: "lawand_20260818_000001", message: "감사합니다." }), (error: unknown) => error instanceof GiftishowError && error.uncertain);
});
