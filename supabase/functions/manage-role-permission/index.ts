 = user.app_metadata?.permissions || [];

  // 步驟 2: 進行權限檢查
  if (!userPermissions.includes('permissions:users:edit')) {
    logger.warn('權限不足，修改權限設定的操作被拒絕', correlationId, {
      operatorId: user.id,
      requiredPermission: 'permissions:users:edit',
    });
    return new Response(JSON.stringify({ error: '權限不足，您無法修改權限設定。' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 步驟 3: 解析從前端傳來的請求內容
  const { roleId, permissionId, action } = await req.json().catch(() => ({}));
  if (!roleId || !permissionId || !['grant', 'revoke'].includes(action)) {
    logger.warn('請求參數無效或不完整', correlationId, {
      operatorId: user.id,
      payload: { roleId, permissionId, action },
    });
    return new Response(JSON.stringify({ error: '請求參數無效或不完整。' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  logger.info(`權限驗證通過，準備 [${action}] 權限`, correlationId, {
    operatorId: user.id,
    action,
    roleId,
    permissionId
  });

  // 步驟 4: 根據 action 執行對應的資料庫操作
  if (action === 'grant') {
    const { error } = await supabaseAdmin
      .from('role_permissions')
      .insert({ role_id: roleId, permission_id: permissionId });
    if (error) throw new Error(`賦予權限時發生錯誤: ${error.message}`);
  } else if (action === 'revoke') {
    const { error } = await supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permission_id', permissionId);
    if (error) throw new Error(`撤銷權限時發生錯誤: ${error.message}`);
  }

  // 步驟 5: 記錄關鍵稽核日誌並回傳成功訊息
  logger.audit(`權限已成功 ${action}`, correlationId, {
    operatorId: user.id,
    action: action,
    roleId: roleId,
    permissionId: permissionId,
  });

  return new Response(
    JSON.stringify({
      success: true,
      message: `權限已成功 ${action === 'grant' ? '賦予' : '撤銷'}`,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

Deno.serve(async (req) => {
  // 處理 CORS 預檢請求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new LoggingService(FUNCTION_NAME, FUNCTION_VERSION);

  // 使用 withErrorLogging 中介軟體包裹主要處理邏輯
  const wrappedHandler = withErrorLogging(mainHandler, logger);

  return await wrappedHandler(req);
});