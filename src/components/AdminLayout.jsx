/**
 * AdminLayout.jsx
 *
 * Thin re-export of the shared DashboardLayout shell.
 *
 * All admin pages already import this file by name
 * (`import AdminLayout from '../components/AdminLayout'`) and wrap their
 * content with `<AdminLayout title="...">`.  By re-exporting DashboardLayout
 * here we get the responsive sidebar for free with zero changes to any page
 * file.  The correct nav links are derived automatically from `user.role`
 * inside DashboardLayout.
 */
export { default } from './DashboardLayout';
