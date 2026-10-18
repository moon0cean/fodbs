import { describe, expect, it } from 'vitest';
import { translateError } from '../web/src/errors';

describe('translateError', () => {
  it('renders Spanish for a code when Spanish is selected', () => {
    expect(translateError('es', 'invalid_credentials', 'Algo ha fallado')).toBe('Correo o contraseña incorrectos.');
    expect(translateError('es', 'Too Many Requests', 'Algo ha fallado')).toBe('Demasiados intentos. Espera un minuto.');
  });

  it('renders English for the same code when English is selected', () => {
    expect(translateError('en', 'last_member', 'Something went wrong')).toBe('You cannot leave while a guest remains.');
  });

  it('falls back when the code is unknown', () => {
    expect(translateError('es', 'gym_login_failed', 'Algo ha fallado')).toBe('Algo ha fallado');
  });
});
