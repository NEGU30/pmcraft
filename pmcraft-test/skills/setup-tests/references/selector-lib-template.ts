// scripts/assets/selector-lib.ts — 自动从 page-map.json 生成，禁止手动修改
// 所有 spec.ts 必须通过 SEL + loc() 引用选择器，禁止硬编码选择器字符串
//
// ⚠️ 注意：SEL 值是 Playwright Locator API 调用（如 page.getByText(...)），
// 不是字符串！不能传给 page.locator() —— 它只接受 CSS/XPath。
// spec.ts 中通过 loc(page, SEL.XXX) 构建 Locator。

import type { Page, Locator } from '@playwright/test';

type Method = 'getByText' | 'getByRole' | 'getByPlaceholder' | 'getByLabel' | 'css';

interface SelEntry {
  m: Method;           // Playwright locator method
  a: any[];            // args
  c?: { m: 'first' | 'nth'; n?: number };  // chain (可选)
}

const DEF: Record<string, SelEntry> = {
  PAGE_TITLE:        { m: 'getByText', a: ['枪火WeGame迁移查询'], c: { m: 'first' } },
  PASSPORT_INPUT:    { m: 'getByPlaceholder', a: ['请输入通行证ID'] },
  QUERY_BTN:         { m: 'getByRole', a: ['button', { name: '查询' }] },
  // ... 覆盖 page-map.json 中全部元素
};

// SEL 代理：SEL.PAGE_TITLE → 'PAGE_TITLE'（key 名作为字符串）
export const SEL = new Proxy({} as Record<string, string>, {
  get(_, key: string) { return key; }
});

// 从 SEL key 构建 Playwright Locator
export function loc(page: Page, key: string): Locator {
  const d = DEF[key];
  if (!d) return page.locator(key);  // fallback: CSS
  let l: Locator;
  switch (d.m) {
    case 'css': l = page.locator(d.a[0]); break;
    case 'getByRole': l = page.getByRole(d.a[0], d.a[1] || {}); break;
    case 'getByPlaceholder': l = page.getByPlaceholder(d.a[0]); break;
    case 'getByLabel': l = page.getByLabel(d.a[0]); break;
    default: l = page.getByText(d.a[0]);
  }
  if (d.c) { l = d.c.m === 'first' ? l.first() : l.nth(d.c.n ?? 0); }
  return l;
}

// 可读选择器描述（用于 checkpoint context）
export function selDesc(key: string): string {
  const d = DEF[key];
  if (!d) return key;
  let s = `${d.m}(${JSON.stringify(d.a[0])})`;
  if (d.a.length > 1) s = `${d.m}(${d.a[0]}, ${JSON.stringify(d.a[1])})`;
  if (d.c) s += `.${d.c.m}(${d.c.n ?? 0})`;
  return s;
}
