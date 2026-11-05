import { Layout, Menu, Dropdown, Avatar, Tag, Typography, Segmented, theme } from 'antd';
import {
  UserOutlined, FunnelPlotOutlined, TeamOutlined, ImportOutlined, DownOutlined,
  SolutionOutlined, SettingOutlined, DashboardOutlined, SunOutlined, MoonOutlined, DesktopOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useThemeMode } from '../theme';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', MANAGER: 'Manager', SALES_REP: 'Sales Rep' };
const ROLE_COLOR = { SUPER_ADMIN: 'gold', MANAGER: 'blue', SALES_REP: 'green' };

export default function AppLayout() {
  const { user, logout, tenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode, isDark } = useThemeMode();
  const { token } = theme.useToken();

  const items = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/leads', icon: <SolutionOutlined />, label: 'Leads Pool' },
  ];
  // Reps don't manage funnels — they switch between funnels inside the Leads Pool.
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER') {
    items.push({ key: '/funnels', icon: <FunnelPlotOutlined />, label: 'Funnels' });
    items.push({ key: '/import', icon: <ImportOutlined />, label: 'Import' });
  }
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER') {
    items.push({ key: '/users', icon: <TeamOutlined />, label: 'Users' });
  }
  if (user?.role === 'SUPER_ADMIN') {
    items.push({ key: '/config', icon: <SettingOutlined />, label: 'Configuration' });
  }

  const userMenu = {
    items: [{ key: 'logout', label: 'Log out' }],
    onClick: ({ key }) => {
      if (key === 'logout') logout();
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme={isDark ? 'dark' : 'light'}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", color: '#ea3b5d' }}>
            Swift<span style={{ color: isDark ? '#7aa2ff' : '#004ecc' }}>-CRM</span>
          </div>
          <Menu
            style={{ flex: 1, borderInlineEnd: 0 }}
            theme={isDark ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={items}
            onClick={({ key }) => navigate(key)}
          />
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 6, letterSpacing: '0.04em' }}>POWERED BY</div>
            <img src="/swipetouch-logo.png" alt="SwipeTouch" style={{ width: '88%', maxWidth: 150 }} />
          </div>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: token.colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Text strong style={{ fontSize: 15 }}>{tenant?.name || ''}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Segmented
              size="small"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'light', icon: <SunOutlined />, title: 'Light' },
                { value: 'dark', icon: <MoonOutlined />, title: 'Dark' },
                { value: 'auto', icon: <DesktopOutlined />, title: 'Auto (match system)' },
              ]}
            />
            <Dropdown menu={userMenu}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} />
                <span>
                  <Text strong>{user?.name}</Text>{' '}
                  <Tag color={ROLE_COLOR[user?.role]} style={{ marginInlineStart: 4 }}>
                    {ROLE_LABEL[user?.role]}
                  </Tag>
                </span>
                <DownOutlined style={{ fontSize: 10 }} />
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
