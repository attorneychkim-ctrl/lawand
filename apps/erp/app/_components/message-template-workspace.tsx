/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";

import {
  centrexMessageByteLength,
  MESSAGE_TEMPLATE_VARIABLES,
  MMS_IMAGE_MAX_BYTES,
  MMS_IMAGE_MAX_HEIGHT,
  MMS_IMAGE_MAX_WIDTH,
} from "@lawand/core";

import type { MessageTemplate } from "../../lib/gateway";

type ImageDraft = { originalName: string; fileBase64: string; previewUrl: string };

const autoSendOptions = [
  { value: null, label: "선택없음" },
  { value: "consultation_assigned", label: "담당자배정" },
  { value: "no_answer", label: "부재 및 무응답" },
  { value: "busy", label: "통화중" },
  { value: "manager_callback_requested", label: "담당자 연결 요청" },
  { value: "rejected", label: "거절" },
] as const;

function readImage(file: File): Promise<ImageDraft> {
  return new Promise((resolve, reject) => {
    if (file.type !== "image/jpeg" || file.size > MMS_IMAGE_MAX_BYTES) {
      reject(new Error("이미지는 200KB 이하 JPG 파일만 사용할 수 있습니다."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
    reader.onload = () => {
      const previewUrl = String(reader.result ?? "");
      const image = new Image();
      image.onerror = () => reject(new Error("올바른 JPG 이미지인지 확인해 주세요."));
      image.onload = () => {
        if (image.width > MMS_IMAGE_MAX_WIDTH || image.height > MMS_IMAGE_MAX_HEIGHT) {
          reject(new Error("이미지 해상도는 1500×1440px 이하여야 합니다."));
          return;
        }
        resolve({
          originalName: file.name,
          fileBase64: previewUrl.slice(previewUrl.indexOf(",") + 1),
          previewUrl,
        });
      };
      image.src = previewUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function MessageTemplateWorkspace({
  initialItems,
  embedded = false,
}: {
  initialItems: MessageTemplate[];
  embedded?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [autoSendTrigger, setAutoSendTrigger] = useState<MessageTemplate["autoSendTrigger"]>(null);
  const [existingImage, setExistingImage] = useState<MessageTemplate["image"]>(null);
  const [imageDraft, setImageDraft] = useState<ImageDraft | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingTriggerId, setUpdatingTriggerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const byteLength = centrexMessageByteLength(body);
  const previewImage = imageDraft?.previewUrl ?? (!removeImage ? existingImage?.url : null);

  function resetForm() {
    setEditingId(null);
    setName("");
    setBody("");
    setAutoSendTrigger(null);
    setExistingImage(null);
    setImageDraft(null);
    setRemoveImage(false);
    setError("");
    setSuccess("");
  }

  function edit(template: MessageTemplate) {
    setEditingId(template.id);
    setName(template.name);
    setBody(template.body);
    setAutoSendTrigger(template.autoSendTrigger);
    setExistingImage(template.image);
    setImageDraft(null);
    setRemoveImage(false);
    setError("");
    setSuccess("");
    if (embedded) {
      document
        .getElementById("template-editor-title")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function insertVariable(variable: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${variable}${body.slice(end)}`);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setImageDraft(await readImage(file));
      setRemoveImage(false);
    } catch (reason) {
      setImageDraft(null);
      setError(reason instanceof Error ? reason.message : "이미지를 확인하지 못했습니다.");
    }
  }

  async function save() {
    if (!name.trim() || !body.trim() || byteLength > 720) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const image = imageDraft
      ? { originalName: imageDraft.originalName, fileBase64: imageDraft.fileBase64 }
      : removeImage
        ? null
        : undefined;
    try {
      const response = await fetch(
        editingId ? `/api/message-templates/${editingId}` : "/api/message-templates",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            body,
            autoSendTrigger,
            ...(image === undefined ? {} : { image }),
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | (MessageTemplate & { message?: string })
        | null;
      if (!response.ok || !result) {
        throw new Error(result?.message ?? "템플릿을 저장하지 못했습니다.");
      }
      setItems((current) => {
        const next = current.some((item) => item.id === result.id)
          ? current.map((item) => (item.id === result.id ? result : item))
          : [...current, result];
        return next.sort((left, right) => left.name.localeCompare(right.name, "ko"));
      });
      setEditingId(result.id);
      setName(result.name);
      setBody(result.body);
      setAutoSendTrigger(result.autoSendTrigger);
      setExistingImage(result.image);
      setImageDraft(null);
      setRemoveImage(false);
      setSuccess("내 문자 템플릿을 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "템플릿을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: MessageTemplate) {
    if (!window.confirm(`\"${template.name}\" 템플릿을 삭제할까요?`)) return;
    setDeletingId(template.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/message-templates/${template.id}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as
        | { id?: string; deleted?: boolean; message?: string }
        | null;
      if (!response.ok || result?.deleted !== true) {
        throw new Error(result?.message ?? "템플릿을 삭제하지 못했습니다.");
      }
      setItems((current) => current.filter((item) => item.id !== template.id));
      if (editingId === template.id) resetForm();
      setSuccess("내 문자 템플릿을 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "템플릿을 삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function updateAutoSend(template: MessageTemplate, next: MessageTemplate["autoSendTrigger"]) {
    setUpdatingTriggerId(template.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/message-templates/${template.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: template.name, body: template.body, autoSendTrigger: next }),
      });
      const result = (await response.json().catch(() => null)) as (MessageTemplate & { message?: string }) | null;
      if (!response.ok || !result) throw new Error(result?.message ?? "자동발송 설정을 저장하지 못했습니다.");
      setItems((current) => current.map((item) => item.id === result.id ? result : item));
      if (editingId === result.id) setAutoSendTrigger(result.autoSendTrigger);
      setSuccess("자동발송 설정을 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "자동발송 설정을 저장하지 못했습니다.");
    } finally {
      setUpdatingTriggerId(null);
    }
  }

  return (
    <div className="message-template-layout">
      <section className="erp-panel message-template-editor" aria-labelledby="template-editor-title">
        <header>
          <div>
            <p className="section-kicker">PERSONAL TEMPLATE</p>
            <h2 id="template-editor-title">{editingId ? "내 템플릿 수정" : "내 템플릿 만들기"}</h2>
            <p>여기서 만든 템플릿은 내 계정에만 표시됩니다.</p>
          </div>
          {editingId ? <button className="secondary-button" disabled={saving || deletingId !== null} onClick={resetForm} type="button">새 템플릿</button> : null}
        </header>

        <div className="message-template-editor-grid">
          <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <label>
              <span>템플릿 이름</span>
              <input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="예: 상담 후 서류 안내" value={name} />
            </label>
            <div className="message-variable-picker">
              <span>자동 입력 변수</span>
              <div>
                {MESSAGE_TEMPLATE_VARIABLES.map((variable) => (
                  <button key={variable} onClick={() => insertVariable(variable)} type="button">{variable}</button>
                ))}
              </div>
            </div>
            <label>
              <span>메시지 내용</span>
              <textarea maxLength={720} onChange={(event) => setBody(event.target.value)} placeholder="고객에게 자주 보내는 문구를 입력해 주세요." ref={textareaRef} rows={10} value={body} />
            </label>
            <label>
              <span>자동발송</span>
              <select
                onChange={(event) => setAutoSendTrigger((event.target.value || null) as MessageTemplate["autoSendTrigger"])}
                value={autoSendTrigger ?? ""}
              >
                {autoSendOptions.map((option) => (
                  <option key={option.value ?? "none"} value={option.value ?? ""}>{option.label}</option>
                ))}
              </select>
              <small className="message-template-auto-help">
                선택한 업무를 저장할 때 이 템플릿이 자동으로 발송됩니다. 조건 하나에는 템플릿 하나만 연결할 수 있습니다.
              </small>
            </label>
            <div className="message-compose-meta">
              <span>{previewImage ? "MMS" : byteLength <= 80 ? "SMS" : "LMS"}</span>
              <span className={byteLength > 720 ? "is-error" : ""}>{byteLength} / 720 byte</span>
            </div>
            <label className="message-image-field">
              <span>이미지 첨부 <small>선택 · JPG 200KB 이하</small></span>
              <input accept="image/jpeg,.jpg,.jpeg" onChange={(event) => void chooseImage(event.target.files?.[0])} type="file" />
            </label>
            {previewImage ? (
              <div className="message-image-selected">
                <span>{imageDraft?.originalName ?? existingImage?.originalName}</span>
                <button onClick={() => { setImageDraft(null); setRemoveImage(true); }} type="button">이미지 제거</button>
              </div>
            ) : null}
            {error ? <p className="message-compose-error" role="alert">{error}</p> : null}
            {success ? <p className="message-compose-result is-succeeded" role="status">{success}</p> : null}
            <button className="primary-button" disabled={saving || deletingId !== null || !name.trim() || !body.trim() || byteLength > 720} type="submit">
              {saving ? "저장 중…" : editingId ? "변경 내용 저장" : "내 템플릿 저장"}
            </button>
          </form>

          <div aria-label="템플릿 문자 미리보기" className="message-phone-preview is-template">
            <div className="message-phone-speaker" />
            <div className="message-phone-header"><span>‹</span><strong>고객 이름</strong><span>•••</span></div>
            <div className="message-phone-time">오전 10:30</div>
            <div className="message-phone-bubble">
              {previewImage ? <img alt="첨부 이미지 미리보기" src={previewImage} /> : null}
              <p>{body || "작성한 템플릿이 여기에 표시됩니다."}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="erp-panel message-template-list" aria-labelledby="template-list-title">
        <header>
          <div>
            <p className="section-kicker">SAVED MESSAGES</p>
            <h2 id="template-list-title">내 템플릿</h2>
            <p>저장한 템플릿은 상담 화면에서 바로 선택할 수 있습니다.</p>
          </div>
          <span className="count-badge">{items.length}개</span>
        </header>
        <div className="message-template-cards">
          {items.length === 0 ? (
            <p className="message-template-empty">아직 저장한 문자 템플릿이 없습니다.</p>
          ) : null}
          {items.map((template) => (
            <article key={template.id}>
              <div>
                <span className="message-template-scope is-personal">내 템플릿</span>
                {template.image ? <span className="message-template-image-badge">이미지</span> : null}
                {template.autoSendTrigger ? <span className="message-template-auto-badge">자동발송 · {autoSendOptions.find((option) => option.value === template.autoSendTrigger)?.label}</span> : null}
              </div>
              <h3>{template.name}</h3>
              <p>{template.body}</p>
              <small>{template.bodyByteLength} byte{template.image ? ` · ${template.image.originalName}` : ""}</small>
              <div className="message-template-card-actions">
                <label className="message-template-auto-select">
                  <span>자동발송</span>
                  <select
                    aria-label={`${template.name} 자동발송`}
                    disabled={saving || deletingId !== null || updatingTriggerId !== null}
                    onChange={(event) => void updateAutoSend(template, (event.target.value || null) as MessageTemplate["autoSendTrigger"])}
                    value={template.autoSendTrigger ?? ""}
                  >
                    {autoSendOptions.map((option) => <option key={option.value ?? "none"} value={option.value ?? ""}>{option.label}</option>)}
                  </select>
                </label>
                <button className="secondary-button" disabled={saving || deletingId !== null} onClick={() => edit(template)} type="button">수정</button>
                <button className="message-template-delete-button" disabled={saving || deletingId !== null} onClick={() => void remove(template)} type="button">
                  {deletingId === template.id ? "삭제 중…" : "삭제"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
