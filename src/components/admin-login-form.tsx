'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/app/actions/auth';

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const result = await login({ password });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace('/admin');
      router.refresh();
    } catch {
      setMessage('No se pudo iniciar sesión. Intentá nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="admin-form">
      <label className="admin-label" htmlFor="admin-password">
        Contraseña
      </label>
      <input
        id="admin-password"
        className="admin-input"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        maxLength={1024}
        autoFocus
      />
      {message ? (
        <p className="admin-error" role="alert">
          {message}
        </p>
      ) : null}
      <button
        className="admin-button admin-button-primary"
        type="submit"
        disabled={busy || password.length === 0}
      >
        {busy ? 'Verificando…' : 'Ingresar'}
      </button>
    </form>
  );
}
