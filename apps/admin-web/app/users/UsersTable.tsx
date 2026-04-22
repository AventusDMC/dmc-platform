'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../lib/api';

type UserRole = 'admin' | 'sales' | 'operations' | 'finance';

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active';
};

type UsersTableProps = {
  apiBaseUrl: string;
  users: User[];
};

const ROLE_OPTIONS: UserRole[] = ['admin', 'sales', 'operations', 'finance'];

function formatRole(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function UsersTable({ apiBaseUrl, users }: UsersTableProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('sales');

  function openCreateModal() {
    setActiveUser(null);
    setName('');
    setEmail('');
    setRole('sales');
    setError('');
    setModalOpen(true);
  }

  function openEditModal(user: User) {
    setActiveUser(user);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setActiveUser(null);
    setError('');
  }

  useEffect(() => {
    if (!modalOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeModal();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await fetch(activeUser ? `${apiBaseUrl}/users/${activeUser.id}` : `${apiBaseUrl}/users`, {
        method: activeUser ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          role,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save user.'));
      }

      await readJsonResponse(response, 'Could not save user.');
      closeModal();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: User) {
    if (!window.confirm(`Delete ${user.name}?`)) {
      return;
    }

    setDeletingId(user.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/users/${user.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete user.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete user.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="entity-list allotment-table-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Users</p>
          <h3>Manage platform users</h3>
        </div>
        <button type="button" className="primary-button" onClick={openCreateModal}>
          Add User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="catalog-empty-state">
          <h3>No users yet</h3>
          <p>Add User</p>
          <div>
            <button type="button" className="secondary-button" onClick={openCreateModal}>
              Add User
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                  </td>
                  <td>{user.email}</td>
                  <td>{formatRole(user.role)}</td>
                  <td>
                    <span className="status-badge">Active</span>
                  </td>
                  <td>
                    <div className="table-action-row">
                      <button type="button" className="compact-button" onClick={() => openEditModal(user)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="compact-button compact-button-danger"
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                      >
                        {deletingId === user.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="quote-client-modal-backdrop" onClick={closeModal}>
          <div className="detail-card quote-client-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              <div>
                <p className="eyebrow">{activeUser ? 'Edit User' : 'Add User'}</p>
                <h3>{activeUser ? activeUser.name : 'Create a new user'}</h3>
              </div>
              <button type="button" className="quote-modal-close-button" onClick={closeModal} aria-label="Close user modal">
                X
              </button>
            </div>

            <form className="entity-form" onSubmit={handleSubmit}>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>

              <label>
                Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>

              <label>
                Role
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatRole(option)}
                    </option>
                  ))}
                </select>
              </label>

              {!activeUser ? <p className="form-helper">New users are created with a temporary password: `changeme123`.</p> : null}
              {error ? <p className="form-error">{error}</p> : null}

              <div className="table-action-row quote-client-modal-actions">
                <button type="button" className="secondary-button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Saving...' : activeUser ? 'Save User' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
