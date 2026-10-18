import nodemailer from 'nodemailer';

export type OutboundMail = { to: string; subject: string; text: string };

export interface Mailer {
  configured(): boolean;
  send(message: OutboundMail): Promise<void>;
}

export class SmtpMailer implements Mailer {
  constructor(private readonly options: { host: string; port: number; user: string; pass: string; from: string }) {}

  configured(): boolean {
    return true;
  }

  async send(message: OutboundMail): Promise<void> {
    const transport = nodemailer.createTransport({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.port === 465,
      auth: this.options.user ? { user: this.options.user, pass: this.options.pass } : undefined,
    });
    await transport.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: OutboundMail[] = [];

  configured(): boolean {
    return true;
  }

  async send(message: OutboundMail): Promise<void> {
    this.sent.push(message);
  }
}

export class UnconfiguredMailer implements Mailer {
  configured(): boolean {
    return false;
  }

  async send(): Promise<void> {
    throw new Error('mail_unconfigured');
  }
}

export function lowBonsMessage(remaining: number): Pick<OutboundMail, 'subject' | 'text'> {
  return {
    subject: 'Te quedan pocos bons',
    text: `Te quedan ${remaining} bons de squash. Una hora de pista gasta 4. Cuando se acaben, FODBS no puede reservar.`,
  };
}

export function emptyBonsMessage(): Pick<OutboundMail, 'subject' | 'text'> {
  return {
    subject: 'Te has quedado sin bons',
    text: 'No te quedan bons de squash. FODBS no puede reservar hasta que compres más.',
  };
}

export function missedBookingMessage(when: string): Pick<OutboundMail, 'subject' | 'text'> {
  return {
    subject: `No hay pista el ${when}`,
    text: `FODBS ha probado ${when} y también media hora antes y media hora después, en las pistas. No había sitio, así que no hay ninguna reserva.`,
  };
}

export function inviteMessage(link: string): OutboundMail['text'] {
  return [
    'Un administrador te ha invitado a FODBS.',
    'Abre este enlace para crear tu cuenta:',
    link,
    '',
    'El enlace caduca en 7 días.',
  ].join('\n');
}
