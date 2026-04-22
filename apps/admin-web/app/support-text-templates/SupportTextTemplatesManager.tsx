'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { TableSectionShell } from '../components/TableSectionShell';
import { SupportTextTemplatesTable } from './SupportTextTemplatesTable';

type SupportTextTemplate = {
  id: string;
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
};

type SupportTextTemplatesManagerProps = {
  apiBaseUrl: string;
  templates: SupportTextTemplate[];
};

const TEMPLATE_TYPE_OPTIONS = [
  { value: 'inclusions', label: 'Inclusions' },
  { value: 'exclusions', label: 'Exclusions' },
  { value: 'terms_notes', label: 'Terms & Notes' },
] as const;

const TEMPLATE_TYPE_LABELS: Record<SupportTextTemplate['templateType'], string> = {
  inclusions: 'Inclusions',
  exclusions: 'Exclusions',
  terms_notes: 'Terms & Notes',
};

export function SupportTextTemplatesManager({ apiBaseUrl, templates }: SupportTextTemplatesManagerProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [templateType, setTemplateType] = useState<'inclusions' | 'exclusions' | 'terms_notes'>('inclusions');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setTemplateType('inclusions');
    setContent('');
  }

  function handleEdit(template: SupportTextTemplate) {
    setEditingId(template.id);
    setTitle(template.title);
    setTemplateType(template.templateType);
    setContent(template.content);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/support-text-templates${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          templateType,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error(`Could not ${editingId ? 'update' : 'create'} template.`);
      }

      resetForm();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save template.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Delete this support-text template?');

    if (!confirmed) {
      return;
    }

    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/support-text-templates/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Could not delete template.');
      }

      if (editingId === id) {
        resetForm();
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete template.');
    }
  }

  return (
    <TableSectionShell
      title="Support-text library"
      description="Keep reusable quote text compact by default and open the editor only when needed."
      context={<p>{templates.length} templates in scope</p>}
      createPanel={
        <CollapsibleCreatePanel
          key={editingId ?? 'create'}
          title={editingId ? 'Edit template' : 'Create template'}
          description={editingId ? 'Update an existing support-text block while keeping the library visible.' : 'Add a reusable support-text block while keeping the library visible.'}
          triggerLabelOpen={editingId ? 'Open editor' : 'Add template'}
          triggerLabelClose="Hide editor"
          defaultOpen={editingId !== null || templates.length === 0}
        >
          <InlineRowEditorShell>
            <form className="entity-form" onSubmit={handleSubmit}>
              <label>
                Title
                <input value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>
              <label>
                Template type
                <select value={templateType} onChange={(event) => setTemplateType(event.target.value as 'inclusions' | 'exclusions' | 'terms_notes')}>
                  {TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Content
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={10}
                  placeholder="Use one line per bullet or note"
                  required
                />
              </label>
              <div className="form-row">
                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingId ? 'Save template' : 'Create template'}
                </button>
                {editingId ? (
                  <button type="button" className="secondary-button" onClick={resetForm}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
              {error ? <p className="form-error">{error}</p> : null}
            </form>
          </InlineRowEditorShell>
        </CollapsibleCreatePanel>
      }
      emptyState={<p className="empty-state">No templates created yet.</p>}
    >
      {templates.length > 0 ? (
        <SupportTextTemplatesTable
          templates={templates}
          typeLabels={TEMPLATE_TYPE_LABELS}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ) : null}
    </TableSectionShell>
  );
}
