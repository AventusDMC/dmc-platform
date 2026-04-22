import { ReactNode } from 'react';

type InlineRowEditorShellProps = {
  children: ReactNode;
};

export function InlineRowEditorShell({ children }: InlineRowEditorShellProps) {
  return <div className="inline-row-editor-shell">{children}</div>;
}
