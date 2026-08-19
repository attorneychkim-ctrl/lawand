"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";

import {
  consultationCustomerNameInputMaxLength,
  consultationCustomerNameSuffix,
  stripConsultationCustomerNameSuffixes,
  type ConsultationCustomerNameTag,
} from "@lawand/core";

type ConsultationCustomerNameInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "maxLength" | "onChange" | "value"
> & {
  tag: ConsultationCustomerNameTag;
  value: string;
  onValueChange: (value: string) => void;
};

export function ConsultationCustomerNameInput({
  tag,
  value,
  onValueChange,
  "aria-describedby": describedBy,
  ...inputProps
}: ConsultationCustomerNameInputProps) {
  const suffixDescriptionId = useId();
  const suffix = consultationCustomerNameSuffix(tag);
  const displayValue = tag === "none"
    ? value
    : stripConsultationCustomerNameSuffixes(value);
  const descriptionIds = [
    describedBy,
    suffix ? suffixDescriptionId : null,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <div className="consultation-customer-name-input">
        <input
          {...inputProps}
          aria-describedby={descriptionIds}
          maxLength={consultationCustomerNameInputMaxLength(tag)}
          onChange={(event) =>
            onValueChange(
              tag === "none"
                ? event.target.value
                : stripConsultationCustomerNameSuffixes(event.target.value),
            )
          }
          value={displayValue}
        />
        {suffix ? (
          <span aria-hidden="true">{suffix}</span>
        ) : null}
      </div>
      {suffix ? (
        <small className="sr-only" id={suffixDescriptionId}>
          선택한 사내 구분에 따라 입력한 이름 뒤에 {suffix}를 붙여 저장합니다.
        </small>
      ) : null}
    </>
  );
}
