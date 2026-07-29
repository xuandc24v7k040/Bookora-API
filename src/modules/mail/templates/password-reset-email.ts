import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components';

export interface PasswordResetEmailProps {
  resetUrl: string;
  ttlMinutes: number;
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f7f8f5',
  color: '#24352a',
  fontFamily: 'Arial, sans-serif',
  margin: 0,
  padding: '24px 12px',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e1e6df',
  borderRadius: '16px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px 28px',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#356244',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontWeight: 700,
  padding: '13px 22px',
  textDecoration: 'none',
};

export function passwordResetEmail({
  resetUrl,
  ttlMinutes,
}: PasswordResetEmailProps): React.ReactElement {
  return React.createElement(
    Html,
    { lang: 'vi' },
    React.createElement(Head),
    React.createElement(
      Preview,
      null,
      `Liên kết đặt lại mật khẩu Bookora có hiệu lực ${ttlMinutes} phút.`,
    ),
    React.createElement(
      Body,
      { style: bodyStyle },
      React.createElement(
        Container,
        { style: containerStyle },
        React.createElement(
          Text,
          {
            style: {
              color: '#356244',
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 20px',
            },
          },
          'BOOKORA',
        ),
        React.createElement(
          Heading,
          { style: { fontSize: '26px', margin: '0 0 16px' } },
          'Đặt lại mật khẩu',
        ),
        React.createElement(
          Text,
          { style: { fontSize: '15px', lineHeight: '24px' } },
          'Bookora đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
        ),
        React.createElement(
          Button,
          { href: resetUrl, style: buttonStyle },
          'Đặt lại mật khẩu',
        ),
        React.createElement(
          Text,
          { style: { fontSize: '14px', lineHeight: '22px' } },
          `Liên kết này có hiệu lực trong ${ttlMinutes} phút. Nếu nút không hoạt động, hãy sao chép đường dẫn sau vào trình duyệt:`,
        ),
        React.createElement(
          Link,
          {
            href: resetUrl,
            style: {
              color: '#356244',
              fontSize: '13px',
              overflowWrap: 'anywhere',
            },
          },
          resetUrl,
        ),
        React.createElement(Hr, {
          style: { borderColor: '#e1e6df', margin: '24px 0' },
        }),
        React.createElement(
          Text,
          {
            style: {
              color: '#66736b',
              fontSize: '13px',
              lineHeight: '20px',
            },
          },
          'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Vui lòng không trả lời email tự động này.',
        ),
        React.createElement(
          Text,
          { style: { color: '#7b867f', fontSize: '12px', marginBottom: 0 } },
          'Bookora — Cùng bạn trên mỗi trang sách.',
        ),
      ),
    ),
  );
}
