'use client';

import { RowDetailsPanel } from '../components/RowDetailsPanel';

type SupportTextTemplate = {
  id: string;
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
};

type SupportTextTemplatesTableProps = {
  templates: SupportTextTemplate[];
  typeLabels: Record<SupportTextTemplate['templateType'], string>;
  onEdit: (template: SupportTextTemplate) => void;
  onDelete: (id: string) => void;
};

export function SupportTextTemplatesTable({
  templates,
  typeLabels,
  onEdit,
  onDelete,
}: SupportTextTemplatesTableProps) {
  return (
    <div className="entity-list allotment-table-stack">
      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Preview</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>
                  <strong>{template.title}</strong>
                </td>
                <td>{typeLabels[template.templateType]}</td>
                <td>
                  <div className="table-subcopy">
                    {template.content.length > 140 ? `${template.content.slice(0, 140)}...` : template.content}
                  </div>
                </td>
                <td>
                  <RowDetailsPanel
                    summary="Open details"
                    description="Preview content and edit or delete this template"
                    className="operations-row-details"
                    bodyClassName="operations-row-details-body"
                  >
                    <p className="detail-copy">{template.content}</p>
                    <div className="table-action-row">
                      <button type="button" className="compact-button" onClick={() => onEdit(template)}>
                        Edit
                      </button>
                      <button type="button" className="compact-button compact-button-danger" onClick={() => onDelete(template.id)}>
                        Delete
                      </button>
                    </div>
                  </RowDetailsPanel>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
