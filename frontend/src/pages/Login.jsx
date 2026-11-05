import { useState } from 'react';
import { Form, Input, Button, Typography, App } from 'antd';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useThemeMode } from '../theme';

const { Title, Text } = Typography;

// Education-themed photo with a brand gradient behind it, so the screen still
// looks good if the image is slow or blocked (local/offline use).
const BG_IMAGE =
  'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1950&q=80';

export default function Login() {
  const { user, login } = useAuth();
  const { message } = App.useApp();
  const { isDark } = useThemeMode();
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await login(values.clientCode, values.email, values.password);
      window.location.href = '/dashboard';
    } catch (e) {
      message.error(e.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const savedCode = (() => { try { return localStorage.getItem('crm_client_code') || ''; } catch { return ''; } })();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundImage: `linear-gradient(135deg, rgba(12,31,44,0.78), rgba(13,148,136,0.62)), url(${BG_IMAGE})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        style={{
          width: 400,
          maxWidth: '100%',
          padding: '40px 36px',
          borderRadius: 18,
          background: isDark ? 'rgba(20,22,26,0.90)' : 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: '0 24px 60px rgba(8,24,58,0.35)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)'}`,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title
            level={2}
            style={{
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#ea3b5d',
            }}
          >
            Swift<span style={{ color: isDark ? '#7aa2ff' : '#004ecc' }}>-CRM</span>
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            School sales, one smart pipeline
          </Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large" initialValues={{ clientCode: savedCode }}>
          <Form.Item
            name="clientCode"
            label="Client code"
            rules={[{ required: true, message: 'Enter your client code' }]}
            normalize={(v) => (v ? v.toUpperCase() : v)}
          >
            <Input placeholder="e.g. SWIPETOUCH" autoComplete="organization" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input autoFocus placeholder="you@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password placeholder="Password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44, fontWeight: 600 }}>
            Log in
          </Button>
        </Form>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6, letterSpacing: '0.04em' }}>
            POWERED BY
          </Text>
          <img src="/swipetouch-logo.png" alt="SwipeTouch" style={{ height: 22 }} />
        </div>
      </div>
    </div>
  );
}
