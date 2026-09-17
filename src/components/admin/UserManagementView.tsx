'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, User, RefreshCw, X, Eye, EyeOff, Edit2 } from 'lucide-react';
import { Modal } from 'antd';

interface UserRecord {
  id: string;
  username: string;
  role: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  _count: { taskContexts: number };
}

export default function UserManagementView() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', password: '', displayName: '', role: 'user', phone: '', email: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', role: '', phone: '', email: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async () => {
    setAddError('');
    if (!addForm.username || !addForm.password) {
      setAddError('用户名和密码不能为空');
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || '创建失败');
        return;
      }
      setShowAddModal(false);
      setAddForm({ username: '', password: '', displayName: '', role: 'user', phone: '', email: '' });
      fetchUsers();
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`确定要删除用户 "${user.displayName || user.username}" 吗？此操作不可恢复。`)) return;
    try {
      const res = await fetch('/api/auth/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) fetchUsers();
    } catch {
      // ignore
    }
  };

  const openEdit = (user: UserRecord) => {
    setEditUser(user);
    setEditForm({
      displayName: user.displayName || '',
      role: user.role,
      phone: user.phone || '',
      email: user.email || '',
    });
    setEditError('');
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      const res = await fetch('/api/auth/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editUser.id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || '更新失败');
        return;
      }
      setEditUser(null);
      fetchUsers();
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">用户管理</h2>
              <p className="text-xs text-gray-400 font-medium">管理系统账号与权限</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
              title="刷新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              添加账号
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 flex gap-4">
        <div className="flex-1 bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">总用户</p>
          <p className="text-2xl font-black text-gray-900 mt-0.5">{users.length}</p>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">管理员</p>
          <p className="text-2xl font-black text-indigo-600 mt-0.5">{users.filter(u => u.role === 'admin').length}</p>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">普通用户</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5">{users.filter(u => u.role === 'user').length}</p>
        </div>
      </div>

      {/* User List */}
      <div className="px-6 pb-6">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/80">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">用户</span>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">角色</span>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">联系方式</span>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">任务数</span>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">注册时间</span>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">操作</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">暂无用户</p>
            </div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_auto] gap-3 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors items-center">
                {/* User info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ${
                    u.role === 'admin' ? 'bg-gradient-to-tr from-indigo-500 to-violet-500' : 'bg-gradient-to-tr from-emerald-500 to-teal-500'
                  }`}>
                    {(u.displayName || u.username)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{u.displayName || u.username}</p>
                    <p className="text-[11px] text-gray-400 truncate">@{u.username}</p>
                  </div>
                </div>

                {/* Role */}
                <div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    u.role === 'admin' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {u.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </div>

                {/* Contact */}
                <div className="text-[12px] text-gray-500 min-w-0">
                  {u.email && <p className="truncate">{u.email}</p>}
                  {u.phone && <p className="truncate">{u.phone}</p>}
                  {!u.email && !u.phone && <span className="text-gray-300">—</span>}
                </div>

                {/* Task count */}
                <div>
                  <span className="text-sm font-bold text-gray-700">{u._count.taskContexts}</span>
                  <span className="text-[11px] text-gray-400 ml-1">个任务</span>
                </div>

                {/* Created date */}
                <div className="text-[12px] text-gray-400">
                  {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(u)}
                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-300 hover:text-indigo-500 transition-all"
                    title="编辑用户"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {u.role !== 'admin' && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                      title="删除用户"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        open={showAddModal}
        onCancel={() => { setShowAddModal(false); setAddError(''); }}
        footer={null}
        title={null}
        width={440}
        centered
        destroyOnClose
      >
        <div className="pt-2">
          <h3 className="text-lg font-black text-gray-900 mb-6">添加新账号</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">用户名 *</label>
              <input
                type="text"
                value={addForm.username}
                onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="账号用户名"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">密码 *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="设置密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">昵称</label>
              <input
                type="text"
                value={addForm.displayName}
                onChange={e => setAddForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="显示名称（可选）"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">角色</label>
              <select
                value={addForm.role}
                onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              >
                <option value="user">User（普通用户）</option>
                <option value="admin">Admin（管理员）</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">手机</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">邮箱</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="可选"
                />
              </div>
            </div>
          </div>

          {addError && (
            <div className="mt-4 flex items-center text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {addError}
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={addLoading || !addForm.username || !addForm.password}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {addLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                创建账号
              </>
            )}
          </button>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        footer={null}
        title={null}
        width={440}
        centered
        destroyOnClose
      >
        <div className="pt-2">
          <h3 className="text-lg font-black text-gray-900 mb-1">编辑用户</h3>
          <p className="text-xs text-gray-400 mb-6">@{editUser?.username}</p>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">显示名称</label>
              <input
                type="text"
                value={editForm.displayName}
                onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="显示名称"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">角色</label>
              <select
                value={editForm.role}
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              >
                <option value="user">User（普通用户）</option>
                <option value="admin">Admin（管理员）</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">手机</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="可选"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">邮箱</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="可选"
                />
              </div>
            </div>
          </div>

          {editError && (
            <div className="mt-4 flex items-center text-red-600 text-sm font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {editError}
            </div>
          )}

          <button
            onClick={handleEdit}
            disabled={editLoading}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            {editLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Edit2 className="w-4 h-4" />
                保存修改
              </>
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
