"use client";

import { useState } from "react";
import { updateProfile, type FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/app/FormMessage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { TextField } from "@/components/app/TextField";
import { DetailRow } from "./DetailRow";

/** Shows the name with a pencil; the pencil turns the row into an edit box with Save and Cancel. */
export function EditableName({ fullName }: { fullName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<FormState>({});
  const [saved, setSaved] = useState(false);

  if (!editing) {
    return (
      <DetailRow
        label="Full name"
        onEdit={() => {
          setState({});
          setSaved(false);
          setEditing(true);
        }}
      >
        <p className="text-base font-medium">{fullName}</p>
        {saved && <p className="mt-1 text-sm text-accent-ink">Name updated</p>}
      </DetailRow>
    );
  }

  return (
    <div className="border-b border-line pb-5">
      <form
        noValidate
        className="space-y-4"
        action={async (form) => {
          const result = await updateProfile({}, form);
          setState(result);
          if (result.ok) {
            setEditing(false);
            setSaved(true);
          }
        }}
      >
        <FormMessage state={state} />
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName}
          error={state.fieldErrors?.fullName}
          autoFocus
          required
        />
        <div className="flex gap-3">
          <SubmitButton className="sm:w-auto sm:px-8">Save</SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-12 rounded-full border border-line bg-surface px-6 text-base font-medium transition-colors hover:bg-canvas"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
