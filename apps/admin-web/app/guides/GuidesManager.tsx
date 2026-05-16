'use client';

import { FormEvent, useState } from 'react';

type Guide = {
  id: string;
  fullName: string;
  languages: string[];
  certifications: string[];
  regions: string[];
  specialties: string[];
  email: string | null;
  phone: string | null;
  active: boolean;
  guideType: 'licensed' | 'freelance' | 'staff' | string;
  bookingServices?: Array<{
    id: string;
    description: string;
    serviceDate: string | null;
    guideConfirmationStatus: string;
    booking?: { bookingRef?: string | null } | null;
  }>;
  blockedDates?: Array<{
    id: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  }>;
};

function parseList(value: FormDataEntryValue | null) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function GuidesManager({ initialGuides }: { initialGuides: Guide[] }) {
  const [guides, setGuides] = useState(initialGuides);
  const [message, setMessage] = useState<string | null>(null);

  async function createGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/guides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: String(formData.get('fullName') || '').trim(),
        languages: parseList(formData.get('languages')),
        certifications: parseList(formData.get('certifications')),
        regions: parseList(formData.get('regions')),
        specialties: parseList(formData.get('specialties')),
        email: String(formData.get('email') || '').trim() || null,
        phone: String(formData.get('phone') || '').trim() || null,
        guideType: String(formData.get('guideType') || 'licensed'),
        active: formData.get('active') === 'on',
      }),
    });
    if (!response.ok) {
      setMessage('Guide could not be saved.');
      return;
    }
    const guide = await response.json();
    setGuides((current) => [guide, ...current]);
    event.currentTarget.reset();
    setMessage('Guide saved.');
  }

  async function blockGuide(event: FormEvent<HTMLFormElement>, guideId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/guides/${guideId}/blocked-dates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: String(formData.get('startDate') || ''),
        endDate: String(formData.get('endDate') || ''),
        reason: String(formData.get('reason') || '').trim() || null,
      }),
    });
    setMessage(response.ok ? 'Guide blocked date saved.' : 'Blocked date could not be saved.');
  }

  return (
    <div className="section-stack">
      <form className="entity-form" onSubmit={createGuide}>
        <h2>Guide Master</h2>
        <input name="fullName" placeholder="Full name" required />
        <textarea name="languages" placeholder="Languages, comma or line separated" />
        <textarea name="certifications" placeholder="Certifications" />
        <textarea name="regions" placeholder="Regions / cities" />
        <textarea name="specialties" placeholder="Specialties" />
        <input name="email" type="email" placeholder="Email" />
        <input name="phone" placeholder="Phone" />
        <select name="guideType" defaultValue="licensed">
          <option value="licensed">Licensed</option>
          <option value="freelance">Freelance</option>
          <option value="staff">Staff</option>
        </select>
        <label className="checkbox-field">
          <input type="checkbox" name="active" defaultChecked /> Active
        </label>
        <button type="submit">Add guide</button>
      </form>
      {message ? <p className="form-helper">{message}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Guide</th>
              <th>Languages</th>
              <th>Regions</th>
              <th>Availability</th>
              <th>Blocked dates</th>
            </tr>
          </thead>
          <tbody>
            {guides.map((guide) => (
              <tr key={guide.id}>
                <td>
                  <strong>{guide.fullName}</strong>
                  <p className="table-subcopy">
                    {guide.guideType} | {guide.active ? 'Active' : 'Inactive'} | {[guide.email, guide.phone].filter(Boolean).join(' / ') || 'Contact pending'}
                  </p>
                </td>
                <td>{guide.languages?.join(', ') || 'Not set'}</td>
                <td>{guide.regions?.join(', ') || 'Not set'}</td>
                <td>
                  <p>{guide.bookingServices?.length || 0} assigned bookings</p>
                  <p className="table-subcopy">
                    {guide.bookingServices?.some((service, index, services) =>
                      service.serviceDate && services.findIndex((entry) => entry.serviceDate?.slice(0, 10) === service.serviceDate?.slice(0, 10)) !== index,
                    )
                      ? 'Overlapping assignment warning'
                      : 'No overlap warning'}
                  </p>
                </td>
                <td>
                  <form className="operations-inline-form" onSubmit={(event) => blockGuide(event, guide.id)}>
                    <input type="date" name="startDate" required />
                    <input type="date" name="endDate" required />
                    <input name="reason" placeholder="Reason" />
                    <button type="submit" className="secondary-button">Block dates</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
