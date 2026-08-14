"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  PhonebookContact,
  PhonebookContactInput,
} from "../../lib/gateway";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^02\d{7,8}$/.test(digits)) {
    const split = digits.length === 9 ? 5 : 6;
    return `${digits.slice(0, 2)}-${digits.slice(2, split)}-${digits.slice(split)}`;
  }
  if (/^\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^\d{11}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function emptyInput(): PhonebookContactInput {
  return { displayName: "", originalPhone: "", connectedPhone: "" };
}

export function PhonebookWorkspace() {
  const [items, setItems] = useState<PhonebookContact[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState<PhonebookContactInput>(emptyInput);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phonebook", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { items?: PhonebookContact[]; message?: string }
        | null;
      if (!response.ok || !Array.isArray(body?.items)) {
        throw new Error(body?.message ?? "전화번호부를 불러오지 못했습니다.");
      }
      setItems(body.items);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "전화번호부를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const digits = query.replace(/\D/g, "");
    if (!normalized) return items;
    return items.filter((item) =>
      item.displayName.toLocaleLowerCase("ko-KR").includes(normalized) ||
      (digits.length > 0 &&
        [item.originalPhone, item.connectedPhone ?? ""].some((phone) =>
          phone.includes(digits),
        )),
    );
  }, [items, query]);

  function openCreate() {
    setEditingId(null);
    setInput(emptyInput());
    setError("");
    setFormOpen(true);
  }

  function openEdit(contact: PhonebookContact) {
    setEditingId(contact.id);
    setInput({
      displayName: contact.displayName,
      originalPhone: contact.originalPhone,
      connectedPhone: contact.connectedPhone ?? "",
    });
    setError("");
    setFormOpen(true);
  }

  async function save() {
    const originalPhone = input.originalPhone.replace(/\D/g, "");
    const connectedPhone = input.connectedPhone?.replace(/\D/g, "") ?? "";
    if (!input.displayName.trim() || originalPhone.length < 8) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId ? `/api/phonebook/${editingId}` : "/api/phonebook",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: input.displayName.trim(),
            originalPhone,
            ...(connectedPhone ? { connectedPhone } : {}),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | (PhonebookContact & { message?: string })
        | null;
      if (!response.ok || !body?.id) {
        throw new Error(body?.message ?? "연락처를 저장하지 못했습니다.");
      }
      setItems((current) =>
        [...current.filter((item) => item.id !== body.id), body].sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "ko-KR"),
        ),
      );
      setFormOpen(false);
      setEditingId(null);
      setInput(emptyInput());
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "연락처를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(contact: PhonebookContact) {
    if (!window.confirm(`${contact.displayName} 연락처를 전화번호부에서 삭제할까요?`)) {
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/phonebook/${contact.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { deactivated?: boolean; message?: string }
        | null;
      if (!response.ok || !body?.deactivated) {
        throw new Error(body?.message ?? "연락처를 삭제하지 못했습니다.");
      }
      setItems((current) => current.filter((item) => item.id !== contact.id));
      if (editingId === contact.id) setFormOpen(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "연락처를 삭제하지 못했습니다.",
      );
    }
  }

  return (
    <section className="erp-panel phonebook-panel">
      <div className="phonebook-toolbar">
        <label className="phonebook-search">
          <span>이름 또는 전화번호 검색</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="서울회생법원, 02-530-1953"
            value={query}
          />
        </label>
        <button className="primary-button" onClick={openCreate} type="button">
          새 연락처
        </button>
      </div>

      {formOpen ? (
        <div className="phonebook-editor">
          <div>
            <p className="eyebrow">{editingId ? "EDIT CONTACT" : "NEW CONTACT"}</p>
            <h2>{editingId ? "발신자 정보 수정" : "발신자 정보 저장"}</h2>
          </div>
          <div className="phonebook-editor-grid">
            <label>
              <span>표시 이름</span>
              <input
                maxLength={100}
                onChange={(event) => setInput((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="예: 서울회생법원"
                value={input.displayName}
              />
            </label>
            <label>
              <span>원번호</span>
              <input
                inputMode="tel"
                maxLength={20}
                onChange={(event) => setInput((current) => ({ ...current, originalPhone: event.target.value }))}
                placeholder="02-530-1953"
                value={formatPhone(input.originalPhone)}
              />
            </label>
            <label>
              <span>연결번호 <small>선택</small></span>
              <input
                inputMode="tel"
                maxLength={20}
                onChange={(event) => setInput((current) => ({ ...current, connectedPhone: event.target.value }))}
                placeholder="착신 시 다르게 보이는 번호"
                value={formatPhone(input.connectedPhone ?? "")}
              />
            </label>
          </div>
          <p>원번호와 연결번호 중 어느 번호로 수신해도 같은 이름으로 표시됩니다.</p>
          <div className="phonebook-editor-actions">
            <button className="secondary-button" onClick={() => setFormOpen(false)} type="button">
              취소
            </button>
            <button
              className="primary-button"
              disabled={saving || !input.displayName.trim() || input.originalPhone.replace(/\D/g, "").length < 8}
              onClick={() => void save()}
              type="button"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="phonebook-error" role="alert">{error}</p> : null}
      {loading ? (
        <p className="phonebook-empty">전화번호부를 불러오는 중입니다.</p>
      ) : filteredItems.length ? (
        <div className="phonebook-list">
          {filteredItems.map((contact) => (
            <article key={contact.id}>
              <div className="phonebook-contact-identity">
                <span aria-hidden="true">{contact.displayName.slice(0, 1)}</span>
                <div>
                  <strong>{contact.displayName}</strong>
                  <small>수신 알림 표시 이름</small>
                </div>
              </div>
              <dl>
                <div>
                  <dt>원번호</dt>
                  <dd>{formatPhone(contact.originalPhone)}</dd>
                </div>
                <div>
                  <dt>연결번호</dt>
                  <dd>{contact.connectedPhone ? formatPhone(contact.connectedPhone) : "미등록"}</dd>
                </div>
              </dl>
              <div className="phonebook-row-actions">
                <button onClick={() => openEdit(contact)} type="button">수정</button>
                <button onClick={() => void deactivate(contact)} type="button">삭제</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="phonebook-empty">
          {query ? "검색 결과가 없습니다." : "저장된 전화번호부 연락처가 없습니다."}
        </p>
      )}
    </section>
  );
}
