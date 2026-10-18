use serde_json::Value;

use super::{CdpError, OutboundMessage, delivery_expression};

pub(super) fn take_verified_plugin_source(
    method: &str,
    response: &mut Value,
) -> Option<Vec<String>> {
    if method != "explorer.plugins.load" || response["ok"] != true {
        return None;
    }
    let value = response
        .get_mut("result")?
        .as_object_mut()?
        .remove("verifiedSource")?;
    if let Some(source) = value.as_str() {
        return Some(vec![source.to_owned()]);
    }
    value
        .as_array()?
        .iter()
        .map(|source| source.as_str().map(str::to_owned))
        .collect()
}

pub(super) fn outbound_expressions(
    outbound: &OutboundMessage,
    receiver_name: &str,
) -> Result<Vec<String>, CdpError> {
    let Some(sources) = &outbound.trusted_script else {
        return Ok(vec![outbound_expression(outbound, receiver_name)?]);
    };
    if sources.is_empty()
        || sources.len() > 33
        || sources.iter().any(|s| s.len() > 4 * 1024 * 1024)
        || sources.iter().map(String::len).sum::<usize>() > 32 * 1024 * 1024
    {
        return Err(CdpError::Protocol);
    }
    let mut expressions = Vec::new();
    for (index, source) in sources.iter().take(sources.len() - 1).enumerate() {
        let reset = if index == 0 {
            "delete window[key];"
        } else {
            ""
        };
        expressions.push(format!("(()=>{{const key=Symbol.for('code-codex:plugin-load-error:v1');{reset}try{{\n{source}\n}}catch(error){{window[key]=String(error).slice(0,500);}}}})()"));
    }
    expressions.push(outbound_expression(outbound, receiver_name)?);
    Ok(expressions)
}

pub(super) fn outbound_expression(
    outbound: &OutboundMessage,
    receiver_name: &str,
) -> Result<String, CdpError> {
    let success = delivery_expression(&outbound.payload, receiver_name)?;
    let Some(sources) = &outbound.trusted_script else {
        return Ok(success);
    };
    let source = sources.last().ok_or(CdpError::Protocol)?;
    if source.len() > 4 * 1024 * 1024 {
        return Err(CdpError::Protocol);
    }
    let id = serde_json::to_string(&outbound.payload["id"]).map_err(|_| CdpError::Protocol)?;
    let receiver = serde_json::to_string(receiver_name).map_err(|_| CdpError::Protocol)?;
    Ok(format!(
        "(()=>{{const key=Symbol.for('code-codex:plugin-load-error:v1');try{{if(window[key])throw new Error(window[key]);\n{source}\n{success}}}catch(error){{const receive=window[{receiver}];if(typeof receive==='function')receive({{id:{id},ok:false,error:{{code:'PLUGIN_EXECUTION',message:String(error)}}}});}}finally{{delete window[key];}}}})()"
    ))
}
