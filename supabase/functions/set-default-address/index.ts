-- 建立一個 PostgreSQL 函式來原子性地更新預設地址
-- 這確保了兩個 UPDATE 操作要麼都成功，要麼都失敗
create or replace function set_default_address_atomic(p_user_id uuid, p_address_id uuid)
returns void as $$
begin
  -- 步驟 1: 將該用戶的所有地址 is_default 設為 false
  update public.addresses
  set is_default = false
  where user_id = p_user_id;

  -- 步驟 2: 將指定的地址 is_default 設為 true
  update public.addresses
  set is_default = true
  where id = p_address_id and user_id = p_user_id;
end;
$$ language plpgsql;