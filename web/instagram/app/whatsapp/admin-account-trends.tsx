import type {AdminSnapshot} from '../../../whatsapp/lib/admin-model';

export default function AccountTrends({data}:{data:AdminSnapshot}) {
  const days=Array.from({length:30},(_,index)=>{
    const day=new Date(data.at-(29-index)*86400000).toISOString().slice(0,10);
    return {
      day,
      registrations:data.tenants.filter(tenant=>new Date(tenant.createdAt).toISOString().slice(0,10)===day).length,
      logins:Number(data.logins.find(item=>item.day===day)?.count||0),
    };
  });
  const maximum=Math.max(1,...days.map(day=>Math.max(day.registrations,day.logins)));
  const hasActivity=days.some(day=>day.registrations||day.logins);
  return <section className="nina-admin-panel">
    <header><div><h2>Registrations & sign-ins</h2><p>Workspace creation and business sign-ins · UTC</p></div><span className="nina-admin-badge">30 days</span></header>
    {hasActivity?<><div className="nina-admin-chart nina-admin-account-chart" role="img" aria-label="Workspace registrations and business sign-ins over the last thirty days">
      {days.map(day=><div key={day.day} title={day.day+': '+day.registrations+' registrations, '+day.logins+' sign-ins'}>
        <span className="received" style={{height:day.registrations/maximum*100+'%'}}/>
        <span className="sent" style={{height:day.logins/maximum*100+'%'}}/>
        <small>{day.day.slice(5)}</small>
      </div>)}
    </div><div className="nina-admin-chart-key"><span>Workspaces created</span><span>Business sign-ins</span></div>
    <details className="nina-admin-trend-details"><summary>Read daily values</summary><ul>{days.filter(day=>day.registrations||day.logins).map(day=><li key={day.day}>{day.day}: {day.registrations} workspaces created, {day.logins} sign-ins</li>)}</ul></details></>:<p>No registrations or sign-ins were recorded in the last 30 days.</p>}
  </section>;
}
